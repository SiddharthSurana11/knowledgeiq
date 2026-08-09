// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var embedding_pb = require('./embedding_pb.js');

function serialize_embedding_GetEmbeddingRequest(arg) {
  if (!(arg instanceof embedding_pb.GetEmbeddingRequest)) {
    throw new Error('Expected argument of type embedding.GetEmbeddingRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_embedding_GetEmbeddingRequest(buffer_arg) {
  return embedding_pb.GetEmbeddingRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_embedding_GetEmbeddingResponse(arg) {
  if (!(arg instanceof embedding_pb.GetEmbeddingResponse)) {
    throw new Error('Expected argument of type embedding.GetEmbeddingResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_embedding_GetEmbeddingResponse(buffer_arg) {
  return embedding_pb.GetEmbeddingResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_embedding_HandleUploadRequest(arg) {
  if (!(arg instanceof embedding_pb.HandleUploadRequest)) {
    throw new Error('Expected argument of type embedding.HandleUploadRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_embedding_HandleUploadRequest(buffer_arg) {
  return embedding_pb.HandleUploadRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_embedding_HandleUploadResponse(arg) {
  if (!(arg instanceof embedding_pb.HandleUploadResponse)) {
    throw new Error('Expected argument of type embedding.HandleUploadResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_embedding_HandleUploadResponse(buffer_arg) {
  return embedding_pb.HandleUploadResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_embedding_RerankRequest(arg) {
  if (!(arg instanceof embedding_pb.RerankRequest)) {
    throw new Error('Expected argument of type embedding.RerankRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_embedding_RerankRequest(buffer_arg) {
  return embedding_pb.RerankRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_embedding_RerankResponse(arg) {
  if (!(arg instanceof embedding_pb.RerankResponse)) {
    throw new Error('Expected argument of type embedding.RerankResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_embedding_RerankResponse(buffer_arg) {
  return embedding_pb.RerankResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


// --------- RPCs ---------
var EmbeddingServiceService = exports.EmbeddingServiceService = {
  handleUpload: {
    path: '/embedding.EmbeddingService/HandleUpload',
    requestStream: false,
    responseStream: false,
    requestType: embedding_pb.HandleUploadRequest,
    responseType: embedding_pb.HandleUploadResponse,
    requestSerialize: serialize_embedding_HandleUploadRequest,
    requestDeserialize: deserialize_embedding_HandleUploadRequest,
    responseSerialize: serialize_embedding_HandleUploadResponse,
    responseDeserialize: deserialize_embedding_HandleUploadResponse,
  },
  getEmbedding: {
    path: '/embedding.EmbeddingService/GetEmbedding',
    requestStream: false,
    responseStream: false,
    requestType: embedding_pb.GetEmbeddingRequest,
    responseType: embedding_pb.GetEmbeddingResponse,
    requestSerialize: serialize_embedding_GetEmbeddingRequest,
    requestDeserialize: deserialize_embedding_GetEmbeddingRequest,
    responseSerialize: serialize_embedding_GetEmbeddingResponse,
    responseDeserialize: deserialize_embedding_GetEmbeddingResponse,
  },
  rerankCandidates: {
    path: '/embedding.EmbeddingService/RerankCandidates',
    requestStream: false,
    responseStream: false,
    requestType: embedding_pb.RerankRequest,
    responseType: embedding_pb.RerankResponse,
    requestSerialize: serialize_embedding_RerankRequest,
    requestDeserialize: deserialize_embedding_RerankRequest,
    responseSerialize: serialize_embedding_RerankResponse,
    responseDeserialize: deserialize_embedding_RerankResponse,
  },
};

exports.EmbeddingServiceClient = grpc.makeGenericClientConstructor(EmbeddingServiceService, 'EmbeddingService');
