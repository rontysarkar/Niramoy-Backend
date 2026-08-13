import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import z from "zod";

export const validateRequest = (zodSchema: z.ZodObject) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body;
    const result = zodSchema.safeParse(body);
    if (!result.success) {
      const message = `${result.error.issues[0].path[0] as string} ${result.error.issues[0].message}`;
      throw new Error(message);
    }

    req.body = result.data;

    next();
  });
};
