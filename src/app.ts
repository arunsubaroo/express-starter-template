import 'dotenv/config.js';

import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import { oas30 } from 'openapi3-ts';
import api from './api';
import logger from './logger';
import { errorHandler, notFound } from './middlewares';
import { generateDocumentation } from './swagger';

const app = express();

app.use(cors());
app.use(
  morgan(
    (process.env.NODE_ENV ?? 'development') === 'development' ? 'dev' : 'tiny',
    { stream: { write: (msg) => logger.info(msg) } },
  ),
);
app.use(express.json());

app.get<{}, oas30.OpenApiBuilder>('/swagger.json', (_req, res) => {
  res.json(generateDocumentation(app));
});

app.use('/api/v1', api);

app.use(notFound);
app.use(errorHandler);

export default app;
