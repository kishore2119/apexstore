package com.ecom.common;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class Errors {
    public record ErrorBody(String code, String message, Map<String, String> fields, String traceId) {}

    private ResponseEntity<ErrorBody> response(HttpStatus status, String code, String message, Map<String, String> fields) {
        return ResponseEntity.status(status).body(new ErrorBody(code, message, fields, MDC.get("traceId")));
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorBody> api(ApiException exception) {
        return response(exception.status, exception.code, exception.getMessage(), Map.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorBody> validation(MethodArgumentNotValidException exception) {
        Map<String, String> fields = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(field -> fields.put(field.getField(), field.getDefaultMessage()));
        return response(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Check the highlighted fields", fields);
    }

    @ExceptionHandler({ConstraintViolationException.class, MethodArgumentTypeMismatchException.class, HttpMessageNotReadableException.class,
        ServletRequestBindingException.class, MissingServletRequestPartException.class})
    ResponseEntity<ErrorBody> malformed(Exception exception) {
        return response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Invalid request values", Map.of());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ErrorBody> uploadTooLarge(MaxUploadSizeExceededException exception) {
        return response(HttpStatus.PAYLOAD_TOO_LARGE, "IMAGE_TOO_LARGE", "Choose a JPG or PNG image smaller than 5 MB", Map.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ErrorBody> methodNotAllowed(HttpRequestMethodNotSupportedException exception) {
        var body = new ErrorBody("METHOD_NOT_ALLOWED", "This endpoint does not support that request method", Map.of(), MDC.get("traceId"));
        var response = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
        if (exception.getSupportedHttpMethods() != null) response.allow(exception.getSupportedHttpMethods().toArray(org.springframework.http.HttpMethod[]::new));
        return response.body(body);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ErrorBody> unsupportedContent(HttpMediaTypeNotSupportedException exception) {
        return response(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "Use the content type required by this endpoint", Map.of());
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    ResponseEntity<ErrorBody> unsupportedResponse(HttpMediaTypeNotAcceptableException exception) {
        return response(HttpStatus.NOT_ACCEPTABLE, "NOT_ACCEPTABLE", "The requested response format is unavailable", Map.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErrorBody> notFound(NoResourceFoundException exception) {
        return response(HttpStatus.NOT_FOUND, "NOT_FOUND", "Endpoint not found", Map.of());
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ErrorBody> denied(AccessDeniedException exception) {
        return response(HttpStatus.FORBIDDEN, "FORBIDDEN", "Insufficient permission", Map.of());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErrorBody> duplicate(DataIntegrityViolationException exception) {
        return response(HttpStatus.CONFLICT, "CONFLICT", "A value is duplicated or violates a data constraint", Map.of());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorBody> unexpected(Exception exception) {
        org.slf4j.LoggerFactory.getLogger(Errors.class).error("Unhandled failure type={} traceId={}", exception.getClass().getSimpleName(), MDC.get("traceId"));
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An unexpected error occurred", Map.of());
    }
}
