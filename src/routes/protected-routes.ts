import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth-middleware";

export function createProtectedRouter(): Router {
  const router = Router();

  router.get("/public/info", (_req, res: Response) => {
    res.status(200).json({ message: "Welcome stranger! This info is public." });
  });

  router.get("/protected/profile", authMiddleware, (req: AuthRequest, res: Response) => {
    res.status(200).json({
      user: {
        id: req.user?.id,
        email: req.user?.email,
        created_at: req.user?.created_at,
      },
    });
  });

  router.get("/protected/dashboard", authMiddleware, (req: AuthRequest, res: Response) => {
    res.status(200).json({
      message: "Welcome to the dashboard!",
      user: {
        id: req.user?.id,
        email: req.user?.email,
      },
    });
  });

  return router;
}
