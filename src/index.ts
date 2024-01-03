import app from './app';
import logger from './logger';
const port = process.env.PORT || 5000;
app.listen(port, () => {
  logger.info(`Listening: http://localhost:${port}`);
});
