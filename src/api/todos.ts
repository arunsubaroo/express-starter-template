import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import { decorate } from '../zod';

const router = express.Router();

const todoSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  done: z.boolean().optional(),
});

const todosSchema = z.array(todoSchema);

export type Todo = z.infer<typeof todoSchema>;
export type Todos = z.infer<typeof todosSchema>;

const todos: Todos = [];

const handler: RequestHandler = (_req, res) => {
  res.json(todos);
};
router.get<never, Todos>(
  '/',
  decorate(handler).meta({ title: 'list TODOs' }).response(todosSchema).build(),
);

export default router;
