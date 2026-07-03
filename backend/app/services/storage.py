from datetime import timedelta

from app.core.config import Settings
from app.models import Document
from app.models.mixins import utc_now


def build_document_object_key(user_id: object, document_id: object, extension: str = "pdf") -> str:
    return f"users/{user_id}/documents/{document_id}/original.{extension}"


class StorageService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def upload_pdf(self, object_key: str, content: bytes, content_type: str) -> None:
        if not self._has_wasabi_credentials:
            return

        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=self.settings.wasabi_endpoint_url,
            region_name=self.settings.wasabi_region,
            aws_access_key_id=self.settings.wasabi_access_key_id,
            aws_secret_access_key=self.settings.wasabi_secret_access_key,
        )
        client.put_object(
            Bucket=self.settings.wasabi_bucket,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )

    def download_pdf(self, document: Document) -> bytes:
        if not self._has_wasabi_credentials:
            return b""

        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=self.settings.wasabi_endpoint_url,
            region_name=self.settings.wasabi_region,
            aws_access_key_id=self.settings.wasabi_access_key_id,
            aws_secret_access_key=self.settings.wasabi_secret_access_key,
        )
        response = client.get_object(Bucket=document.wasabi_bucket, Key=document.wasabi_object_key)
        return response["Body"].read()

    def signed_file_url(self, document: Document) -> dict[str, str]:
        expires_at = utc_now() + timedelta(seconds=self.settings.signed_url_ttl_seconds)
        if self._has_wasabi_credentials:
            import boto3

            client = boto3.client(
                "s3",
                endpoint_url=self.settings.wasabi_endpoint_url,
                region_name=self.settings.wasabi_region,
                aws_access_key_id=self.settings.wasabi_access_key_id,
                aws_secret_access_key=self.settings.wasabi_secret_access_key,
            )
            url = client.generate_presigned_url(
                "get_object",
                Params={"Bucket": document.wasabi_bucket, "Key": document.wasabi_object_key},
                ExpiresIn=self.settings.signed_url_ttl_seconds,
            )
        else:
            url = (
                f"https://wasabi.local/{document.wasabi_bucket}/"
                f"{document.wasabi_object_key}?signed=placeholder"
            )
        return {"url": url, "expires_at": expires_at.isoformat()}

    def delete_pdf(self, document: Document) -> None:
        if not self._has_wasabi_credentials:
            return

        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=self.settings.wasabi_endpoint_url,
            region_name=self.settings.wasabi_region,
            aws_access_key_id=self.settings.wasabi_access_key_id,
            aws_secret_access_key=self.settings.wasabi_secret_access_key,
        )
        client.delete_object(Bucket=document.wasabi_bucket, Key=document.wasabi_object_key)

    @property
    def _has_wasabi_credentials(self) -> bool:
        return bool(
            self.settings.wasabi_access_key_id
            and self.settings.wasabi_secret_access_key
            and self.settings.wasabi_bucket
        )


def get_storage_service(settings: Settings) -> StorageService:
    return StorageService(settings)
