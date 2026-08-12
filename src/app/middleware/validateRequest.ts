import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import z from "zod";

export const validateRequest = (zodSchema: z.ZodObject) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body;
    const result = zodSchema.safeParse(body);
    if (!result.success) {
      throw new Error(result.error.issues[0].message);
    }

    req.body = result.data;

    next();
  });
};
