from dataclasses import dataclass
from typing import Iterable, Iterator

from app.core.config import Settings
from app.models import Document, DocumentChunk, User


@dataclass(frozen=True)
class RetrievedSource:
    chunk_id: str
    page_start: int
    page_end: int
    excerpt: str
    score: float | None


class VectorService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if self.settings.openai_api_key:
            from openai import OpenAI

            client = OpenAI(api_key=self.settings.openai_api_key)
            response = client.embeddings.create(
                model=self.settings.openai_embedding_model,
                input=texts,
            )
            return [item.embedding for item in response.data]

        return [[0.0] for _ in texts]

    def upsert_document_chunks(
        self,
        user: User,
        document: Document,
        chunks: Iterable[DocumentChunk],
        vectors: list[list[float]],
    ) -> None:
        records = [
            {
                "id": chunk.pinecone_vector_id,
                "values": vector,
                "metadata": self._metadata_for_chunk(user, document, chunk),
            }
            for chunk, vector in zip(chunks, vectors, strict=False)
        ]
        if not records or not self.settings.pinecone_api_key:
            return

        from pinecone import Pinecone

        index = Pinecone(api_key=self.settings.pinecone_api_key).Index(self.settings.pinecone_index_name)
        index.upsert(vectors=records, namespace=self.settings.pinecone_namespace)

    def query_document(self, user: User, document: Document, question: str) -> list[RetrievedSource]:
        if self.settings.openai_api_key and self.settings.pinecone_api_key:
            from pinecone import Pinecone

            question_vector = self.embed_texts([question])[0]
            index = Pinecone(api_key=self.settings.pinecone_api_key).Index(self.settings.pinecone_index_name)
            response = index.query(
                vector=question_vector,
                namespace=self.settings.pinecone_namespace,
                top_k=8,
                include_metadata=True,
                filter={"user_id": str(user.id), "document_id": str(document.id)},
            )
            return [
                RetrievedSource(
                    chunk_id=str(match.metadata.get("chunk_id")),
                    page_start=int(match.metadata.get("page_start", 1)),
                    page_end=int(match.metadata.get("page_end", match.metadata.get("page_start", 1))),
                    excerpt=str(match.metadata.get("text_excerpt", "")),
                    score=float(match.score) if match.score is not None else None,
                )
                for match in response.matches
                if match.metadata
            ]

        return [
            RetrievedSource(
                chunk_id=str(chunk.id),
                page_start=chunk.page_start,
                page_end=chunk.page_end,
                excerpt=chunk.text_excerpt,
                score=None,
            )
            for chunk in document.chunks[:3]
        ]

    def delete_document_vectors(self, user: User, document: Document) -> None:
        if not self.settings.pinecone_api_key:
            return

        from pinecone import Pinecone

        index = Pinecone(api_key=self.settings.pinecone_api_key).Index(self.settings.pinecone_index_name)
        index.delete(
            namespace=self.settings.pinecone_namespace,
            filter={"user_id": str(user.id), "document_id": str(document.id)},
        )

    def stream_answer_tokens(self, question: str, sources: list[RetrievedSource]) -> Iterator[str]:
        if not self.settings.openai_api_key:
            if sources:
                yield (
                    "Based on the retrieved document context, "
                    f"{sources[0].excerpt}"
                )
            else:
                yield "The document does not provide enough information to answer that question."
            return

        from openai import OpenAI

        context = "\n\n".join(
            f"[Source {index}]\nPages: {source.page_start}-{source.page_end}\nText: {source.excerpt}"
            for index, source in enumerate(sources, start=1)
        )
        client = OpenAI(api_key=self.settings.openai_api_key)
        stream = client.chat.completions.create(
            model=self.settings.openai_chat_model,
            temperature=0.1,
            stream=True,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer using only the provided document context. "
                        "If the context is insufficient, say the document does not provide enough information. "
                        "Do not invent facts, citations, or page numbers."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Question: {question}\n\nDocument context:\n{context or 'No context retrieved.'}",
                },
            ],
        )
        for event in stream:
            token = event.choices[0].delta.content
            if token:
                yield token

    def _metadata_for_chunk(
        self,
        user: User,
        document: Document,
        chunk: DocumentChunk,
    ) -> dict[str, object]:
        return {
            "user_id": str(user.id),
            "clerk_user_id": user.clerk_user_id,
            "document_id": str(document.id),
            "chunk_id": str(chunk.id),
            "chunk_index": chunk.chunk_index,
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
            "text_excerpt": chunk.text_excerpt,
        }


def get_vector_service(settings: Settings) -> VectorService:
    return VectorService(settings)
