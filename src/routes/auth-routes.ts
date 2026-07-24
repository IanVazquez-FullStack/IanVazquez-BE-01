import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/auth/signup", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      res.status(201).json({ user: data.user });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        res.status(401).json({ error: "Invalid login credentials" });
        return;
      }

      res.status(200).json({
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/logout", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Access token required" });
        return;
      }

      const { error } = await supabase.auth.signOut();

      if (error) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
