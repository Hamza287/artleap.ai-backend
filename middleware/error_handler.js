const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const details = process.env.NODE_ENV === 'development' ? err.stack : undefined;
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(details && { details })
  });
};

module.exports = errorHandler;