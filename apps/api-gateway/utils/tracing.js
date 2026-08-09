/**
 * Lightweight OpenTelemetry Tracing for KnowledgeIQ API Gateway
 * ==============================================================
 * Exports spans to console and a local JSONL file for interview-ready
 * observability proof. No Jaeger, Grafana, or remote collector required.
 *
 * Uses the existing X-Request-Id (correlation ID) as a span attribute
 * for cross-referencing with existing structured logs.
 *
 * Usage:
 *   const { tracer, startSpan, endSpan } = require('./tracing');
 *   const span = startSpan('operation.name', { 'custom.attr': 'value' });
 *   // ... do work ...
 *   endSpan(span, { 'result.count': 5 });
 */

const { trace, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const OTelResources = require('@opentelemetry/resources');
let resource;
if (typeof OTelResources.resourceFromAttributes === 'function') {
  resource = OTelResources.resourceFromAttributes({
    'service.name': 'knowledgeiq-api-gateway',
    'service.version': '1.0.0'
  });
} else if (typeof OTelResources.Resource === 'function') {
  resource = new OTelResources.Resource({
    'service.name': 'knowledgeiq-api-gateway',
    'service.version': '1.0.0'
  });
}

const fs = require('fs');
const path = require('path');

// ─── JSONL File Exporter ───────────────────────────────────────────────────
// Writes one JSON line per completed span to logs/traces-YYYY-MM-DD.jsonl
class JsonlFileSpanExporter {
  export(spans, resultCallback) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const filePath = path.join(logDir, `traces-${dateStr}.jsonl`);

    const lines = spans.map(span => {
      const duration = span.duration;
      const durationMs = (duration[0] * 1000) + (duration[1] / 1e6);
      return JSON.stringify({
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        parentSpanId: span.parentSpanId || undefined,
        name: span.name,
        kind: span.kind,
        startTime: new Date(span.startTime[0] * 1000 + span.startTime[1] / 1e6).toISOString(),
        durationMs: Math.round(durationMs * 100) / 100,
        status: span.status,
        attributes: span.attributes
      });
    }).join('\n') + '\n';

    fs.appendFileSync(filePath, lines);
    resultCallback({ code: 0 }); // ExportResultCode.SUCCESS
  }

  shutdown() {
    return Promise.resolve();
  }
}

const consoleProcessor = new SimpleSpanProcessor(new ConsoleSpanExporter());
const jsonlProcessor = new SimpleSpanProcessor(new JsonlFileSpanExporter());

// ─── Provider Setup ────────────────────────────────────────────────────────
const providerOptions = {
  spanProcessors: [consoleProcessor, jsonlProcessor]
};
if (resource) {
  providerOptions.resource = resource;
}

const provider = new NodeTracerProvider(providerOptions);
if (typeof provider.addSpanProcessor === 'function') {
  try {
    provider.addSpanProcessor(consoleProcessor);
    provider.addSpanProcessor(jsonlProcessor);
  } catch (e) {
    // Already added via spanProcessors option
  }
}

provider.register();

const tracer = trace.getTracer('knowledgeiq-api-gateway');

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Start a new span with optional initial attributes.
 * @param {string} name - Span name (e.g. 'chat.request', 'pinecone.query')
 * @param {Object} [attributes] - Initial span attributes
 * @returns {import('@opentelemetry/api').Span}
 */
function startSpan(name, attributes = {}) {
  return tracer.startSpan(name, { attributes });
}

/**
 * End a span, optionally adding final attributes.
 * @param {import('@opentelemetry/api').Span} span
 * @param {Object} [attributes] - Attributes to add before ending
 * @param {Error} [error] - If provided, marks span as error
 */
function endSpan(span, attributes = {}, error = null) {
  if (!span) return;
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      span.setAttribute(key, value);
    }
  }
  if (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

module.exports = { tracer, startSpan, endSpan };
