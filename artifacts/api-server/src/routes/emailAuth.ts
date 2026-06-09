import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, userCredentialsTable } from "@workspace/db";
import { EmailRegisterBody, EmailLoginBody } from "@workspace/api-zod";
import { createSession, type SessionData } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/email-register", async (req: Request, res: Response) => {
  const parsed = EmailRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const { email, password, firstName, lastName } = parsed.data;

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    const creds = await db
      .select()
      .from(userCredentialsTable)
      .where(eq(userCredentialsTable.userId, existing[0].id))
      .limit(1);
    if (creds.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let user = existing[0];
  if (!user) {
    const [created] = await db
      .insert(usersTable)
      .values({
        email: email.toLowerCase(),
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
      })
      .returning();
    user = created;
  }

  await db.insert(userCredentialsTable).values({ userId: user.id, passwordHash });

  const sessionUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
  const sessionData: SessionData = { user: sessionUser, access_token: "" };
  const sid = await createSession(sessionData);

  res.json({ token: sid, user: sessionUser });
});

router.post("/auth/email-login", async (req: Request, res: Response) => {
  const parsed = EmailLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const [creds] = await db
    .select()
    .from(userCredentialsTable)
    .where(eq(userCredentialsTable.userId, user.id))
    .limit(1);

  if (!creds) {
    res.status(401).json({ error: "This account uses a different sign-in method" });
    return;
  }

  const valid = await bcrypt.compare(password, creds.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const sessionUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
  const sessionData: SessionData = { user: sessionUser, access_token: "" };
  const sid = await createSession(sessionData);

  res.json({ token: sid, user: sessionUser });
});

export default router;
