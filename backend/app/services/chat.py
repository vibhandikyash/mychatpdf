import json
from collections.abc import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Chat, Document, DocumentStatus, Message, MessageRole, MessageStatus, User
from app.models.mixins import utc_now
from app.services.vector import VectorService


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
        status=MessageStatus.SUCCEEDED,
        content="The document does not provide enough information yet.",
        created_at=utc_now(),
    )
    db.add_all([user_message, assistant_message])
    db.commit()
    db.refresh(assistant_message)

    sources = vector_service.query_document(user, document, content)
    yield format_sse("message_start", {"message_id": str(assistant_message.id)})
    yield format_sse("token", {"text": assistant_message.content})
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
