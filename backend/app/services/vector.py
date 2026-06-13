from dataclasses import dataclass
from typing import Iterable

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
        return [[0.0] for _ in texts]

    def upsert_document_chunks(
        self,
        user: User,
        document: Document,
        chunks: Iterable[DocumentChunk],
        vectors: list[list[float]],
    ) -> None:
        for chunk, vector in zip(chunks, vectors, strict=False):
            self._metadata_for_chunk(user, document, chunk)
            _ = vector

    def query_document(self, user: User, document: Document, question: str) -> list[RetrievedSource]:
        _ = question
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
        _ = (user, document)

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
