import type { NextFunction, Request, RequestHandler, Response } from "express";
import { config } from "../config.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Identité de l'utilisateur courant. Point d'entrée unique pour brancher
 * plus tard l'authentification (session, JWT…) : remplacez cette fonction.
 */
export function userId(_req: Request): string {
  return config.defaultUserId;
}

export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next: NextFunction) =>
    fn(req, res).catch(next);
