import grpc
import protos.embedding_pb2 as embedding_pb2
import protos.embedding_pb2_grpc as embedding_pb2_grpc

def run():
    # Set your values here
    GRPC_SERVER = 'localhost:50052'
    TEST_TEMP_PATH = '/home/siddharthsurana/Desktop/Codes/AI Chatbot Project/Data/LOS/LOS Feature.docx'  # Change to your test file path
    TEST_CATEGORY = 'LOS'
    TEST_ORIGINAL_NAME = 'LOS Feature.docx'

    # Open channel
    channel = grpc.insecure_channel(GRPC_SERVER)
    stub = embedding_pb2_grpc.EmbeddingServiceStub(channel)

    # Prepare request
    request = embedding_pb2.HandleUploadRequest(
        temp_path=TEST_TEMP_PATH,
        category=TEST_CATEGORY,
        original_name=TEST_ORIGINAL_NAME
    )

    # Call service
    response = stub.HandleUpload(request)
    print("gRPC Response:")
    print(f"Status: {response.status}")
    print(f"Final Path: {response.final_path}")
    print(f"Message: {response.message}")

if __name__ == '__main__':
    run()
  