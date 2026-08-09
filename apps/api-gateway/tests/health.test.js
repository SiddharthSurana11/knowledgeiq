const request = require('supertest');

jest.mock('../utils/logger.js', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  http: jest.fn()
}));

jest.mock('../utils/mongoClient.js', () => ({
  connectToDB: jest.fn().mockResolvedValue({}),
  getDB: jest.fn().mockReturnValue({
    command: jest.fn().mockResolvedValue({ ok: 1 })
  })
}));

jest.mock('../utils/categorySeeder.js', () => ({
  seedCategories: jest.fn().mockResolvedValue()
}));

jest.mock('../utils/storage/index.js', () => ({
  init: jest.fn().mockResolvedValue(),
  provider: 'mock',
}));

jest.mock('../utils/pineconeClient.js', () => ({
  index: {
    describeIndexStats: jest.fn().mockResolvedValue({})
  }
}));

const app = require('../server');

describe('GET /health', () => {
  it('should return 200 and healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('healthy');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('memoryUsage');
    expect(res.body).toHaveProperty('nodeVersion');
    expect(res.body.mongodb).toEqual('connected');
    expect(res.body.pinecone).toEqual('connected');
  });
});
