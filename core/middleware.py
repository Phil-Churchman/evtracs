import json
import logging
import time
import uuid

logger = logging.getLogger("api.events")

SENSITIVE_KEYS = {"password", "token", "secret", "access", "refresh", "api_key", "authorization"}
MAX_PAYLOAD_SIZE = 10 * 1024  # 10 KB limit for parsing payloads

class EfficientAPILoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Generate tracing ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.request_id = request_id

        # perf_counter is more precise and efficient than time.time()
        start_time = time.perf_counter()

        # Process the request
        response = self.get_response(request)

        # Calculate duration in milliseconds
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Fire and forget the log generation
        self._log_event(request, response, request_id, duration_ms)

        response["X-Request-ID"] = request_id
        return response

    def _log_event(self, request, response, request_id, duration_ms):
        """Extracts data and logs the event without blocking the response generation."""
        user_id = getattr(getattr(request, "user", None), "id", None)
        
        log_data = {
            "event": "api_request",
            "request_id": request_id,
            "method": request.method,
            "path": request.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "user_id": user_id,
            "ip_address": self._get_client_ip(request),
        }

        # Only extract bodies for errors or specific methods to save CPU cycles
        if response.status_code >= 400 or request.method in ["POST", "PUT", "PATCH"]:
            log_data["request_body"] = self._extract_body(request.body, request.content_type)
            log_data["response_body"] = self._extract_body(response.content, response.get("Content-Type"))

        if response.status_code >= 500:
            logger.error("API Server Error", extra=log_data)
        elif response.status_code >= 400:
            logger.warning("API Client Error", extra=log_data)
        else:
            logger.info("API Request", extra=log_data)

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        return x_forwarded_for.split(",")[0].strip() if x_forwarded_for else request.META.get("REMOTE_ADDR")

    def _extract_body(self, payload, content_type):
        """Safely extract and truncate payloads to prevent memory bloat."""
        if not payload or not content_type or "application/json" not in content_type:
            return None
            
        if len(payload) > MAX_PAYLOAD_SIZE:
            return "[PAYLOAD_TOO_LARGE_TO_LOG]"

        try:
            # For bytes payloads (request.body or response.content)
            if isinstance(payload, bytes):
                data = json.loads(payload.decode("utf-8"))
            else:
                data = payload
            return self._mask_sensitive_data(data)
        except (ValueError, UnicodeDecodeError):
            return "[UNPARSABLE_PAYLOAD]"

    def _mask_sensitive_data(self, data):
        """Recursively mask credentials."""
        if isinstance(data, dict):
            return {
                k: ("***FILTERED***" if k.lower() in SENSITIVE_KEYS else self._mask_sensitive_data(v))
                for k, v in data.items()
            }
        elif isinstance(data, list):
            return [self._mask_sensitive_data(item) for item in data]
        return data