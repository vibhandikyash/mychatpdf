import json
import re
from collections.abc import Iterator
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Chat,
    Document,
    DocumentStatus,
    Message,
    MessageRole,
    MessageSource,
    MessageStatus,
    User,
)
from app.models.mixins import utc_now
from app.services.vector import VectorService

RECENT_HISTORY_MESSAGE_LIMIT = 8
RECENT_HISTORY_MAX_CHARS = 2400
FOLLOW_UP_TERMS = {
    "it",
    "its",
    "that",
    "this",
    "they",
    "them",
    "their",
    "those",
    "these",
    "previous",
    "above",
    "same",
}


def get_or_create_chat(db: Session, user: User, document: Document) -> Chat:
    chat = db.scalar(select(Chat).where(Chat.document_id == document.id, Chat.user_id == user.id))
    if chat is None:
        chat = Chat(user_id=user.id, document_id=document.id, title=document.original_filename)
        db.add(chat)
        db.commit()
        db.refresh(chat)
    return chat


def format_sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def question_needs_conversation_context(question: str) -> bool:
    words = re.findall(r"[a-z0-9']+", question.lower())
    if not words:
        return False
    return len(words) <= 5 or any(word in FOLLOW_UP_TERMS for word in words)


def build_contextual_question(current_question: str, prior_messages: list[Message]) -> str:
    if not question_needs_conversation_context(current_question):
        return current_question

    succeeded_messages = [
        message
        for message in prior_messages
        if message.status in {MessageStatus.SUCCEEDED, MessageStatus.SUCCEEDED.value} and message.content.strip()
    ]
    if not succeeded_messages:
        return current_question

    recent_messages = succeeded_messages[-RECENT_HISTORY_MESSAGE_LIMIT:]
    history_lines = []
    for message in recent_messages:
        role = getattr(message.role, "value", message.role)
        history_lines.append(f"{role}: {message.content.strip()}")
    history = "\n".join(history_lines)
    if len(history) > RECENT_HISTORY_MAX_CHARS:
        history = history[-RECENT_HISTORY_MAX_CHARS:]

    return f"Recent conversation:\n{history}\n\nCurrent question: {current_question}"


def stream_chat_response(
    db: Session,
    user: User,
    document: Document,
    content: str,
    vector_service: VectorService,
) -> Iterator[str]:
    if document.status != DocumentStatus.READY:
        yield format_sse("error", {"message": "Document is not ready for chat"})
        return

    chat = get_or_create_chat(db, user, document)
    prior_messages = list(
        db.scalars(
            select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at)
        )
    )
    contextual_question = build_contextual_question(content, prior_messages)
    user_message = Message(
        user_id=user.id,
        document_id=document.id,
        chat_id=chat.id,
        role=MessageRole.USER,
        status=MessageStatus.SUCCEEDED,
        content=content,
        created_at=utc_now(),
    )
    assistant_message = Message(
        user_id=user.id,
        document_id=document.id,
        chat_id=chat.id,
        role=MessageRole.ASSISTANT,
        status=MessageStatus.PENDING,
        content="",
        created_at=utc_now(),
    )
    db.add_all([user_message, assistant_message])
    db.commit()
    db.refresh(assistant_message)

    sources = vector_service.query_document(user, document, contextual_question)
    answer_parts: list[str] = []
    yield format_sse("message_start", {"message_id": str(assistant_message.id)})
    for token in vector_service.stream_answer_tokens(contextual_question, sources):
        answer_parts.append(token)
        yield format_sse("token", {"text": token})

    assistant_message.content = "".join(answer_parts)
    assistant_message.status = MessageStatus.SUCCEEDED
    for rank, source in enumerate(sources, start=1):
        db.add(
            MessageSource(
                message_id=assistant_message.id,
                document_id=document.id,
                chunk_id=UUID(source.chunk_id),
                page_start=source.page_start,
                page_end=source.page_end,
                excerpt=source.excerpt,
                score=source.score,
                rank=rank,
            )
        )
    db.commit()
    yield format_sse(
        "sources",
        {
            "items": [
                {
                    "chunk_id": source.chunk_id,
                    "page_start": source.page_start,
                    "page_end": source.page_end,
                    "excerpt": source.excerpt,
                    "score": source.score,
                }
                for source in sources
            ]
        },
    )
    yield format_sse("message_done", {"message_id": str(assistant_message.id)})
