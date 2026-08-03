import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";

export interface AuthUser {
  id: string;
  email?: string;
  created_at?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export type UserVerifier = (token: string) => Promise<AuthUser | null>;

const supabaseVerifier: UserVerifier = async (token) => {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    created_at: data.user.created_at,
  };
};

export function createAuthMiddleware(verify: UserVerifier = supabaseVerifier) {
  return async function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Access token required" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const user = await verify(token);

    if (!user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    req.user = user;
    next();
  };
}

export const authMiddleware = createAuthMiddleware();
