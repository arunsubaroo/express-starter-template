import express from 'express';

import MessageResponse from '../types/MessageResponse';
import todos from './todos';

const router = express.Router();

router.get<{}, MessageResponse>('/', (_req, res) => {
  res.json({
    message: 'API',
  });
});

router.use('/todos', todos);

export default router;
