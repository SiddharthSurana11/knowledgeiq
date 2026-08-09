const { validateConfig, config } = require('../config');

describe('Configuration Validator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should successfully validate when all required vars are present', () => {
    process.env.MONGODB_URI = 'mongodb://localhost';
    process.env.MONGODB_DB = 'test';
    process.env.PINECONE_API_KEY = 'key';
    process.env.PINECONE_INDEX = 'idx';
    process.env.STORAGE_PROVIDER = 'minio';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_BUCKET = 'b';
    process.env.MINIO_ACCESS_KEY = 'a';
    process.env.MINIO_SECRET_KEY = 's';

    expect(() => validateConfig()).not.toThrow();
  });

  it('should call process.exit when a required var is missing', () => {
    process.env.MONGODB_URI = '';
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    validateConfig();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
