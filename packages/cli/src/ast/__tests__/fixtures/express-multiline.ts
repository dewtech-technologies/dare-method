import { Router } from 'express';
const router = Router();
router.get(
  '/users/:id',
  handler,
);
