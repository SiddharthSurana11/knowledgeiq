// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var llm_service_pb = require('./llm_service_pb.js');

function serialize_GenerateResponseReply(arg) {
  if (!(arg instanceof llm_service_pb.GenerateResponseReply)) {
    throw new Error('Expected argument of type GenerateResponseReply');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_GenerateResponseReply(buffer_arg) {
  return llm_service_pb.GenerateResponseReply.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_GenerateResponseRequest(arg) {
  if (!(arg instanceof llm_service_pb.GenerateResponseRequest)) {
    throw new Error('Expected argument of type GenerateResponseRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_GenerateResponseRequest(buffer_arg) {
  return llm_service_pb.GenerateResponseRequest.deserializeBinary(new Uint8Array(buffer_arg));
}


var LLMServiceService = exports.LLMServiceService = {
  generateResponse: {
    path: '/LLMService/GenerateResponse',
    requestStream: false,
    responseStream: false,
    requestType: llm_service_pb.GenerateResponseRequest,
    responseType: llm_service_pb.GenerateResponseReply,
    requestSerialize: serialize_GenerateResponseRequest,
    requestDeserialize: deserialize_GenerateResponseRequest,
    responseSerialize: serialize_GenerateResponseReply,
    responseDeserialize: deserialize_GenerateResponseReply,
  },
};

exports.LLMServiceClient = grpc.makeGenericClientConstructor(LLMServiceService, 'LLMService');
