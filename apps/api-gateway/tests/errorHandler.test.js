const { globalErrorHandler } = require('../middlewares/errorHandler');

describe('Global Error Handler', () => {
  let req, res, next;

  beforeEach(() => {
    req = { id: 'test-req-123' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  it('should assign a KIQ-9999 code and status 500 for generic errors', () => {
    const error = new Error('Test generic error');
    
    globalErrorHandler(error, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'KIQ-9999',
      message: 'Test generic error'
    }));
  });

  it('should assign KIQ-1001 for 400 Bad Request status', () => {
    const error = new Error('Bad input');
    error.status = 400;

    globalErrorHandler(error, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'KIQ-1001'
    }));
  });
  
  it('should assign KIQ-4009 for 409 Conflict status', () => {
    const error = new Error('Conflict');
    error.status = 409;

    globalErrorHandler(error, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'KIQ-4009'
    }));
  });
});
