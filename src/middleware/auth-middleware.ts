import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    created_at?: string;
  };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Access token required" });
    return;
  }

  const token = authHeader.split(" ")[1];

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = {
    id: data.user.id,
    email: data.user.email,
    created_at: data.user.created_at,
  };

  next();
}
