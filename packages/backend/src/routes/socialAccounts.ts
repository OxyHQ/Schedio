import { uuidv7 } from "@oxyhq/db";
import { and, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { getRequiredOxyUserId } from "@oxyhq/core/server";
import { getDb } from "../db";
import { SOCIAL_PLATFORMS, socialAccounts, type SocialPlatform } from "../db/schema";
import { encryptSocialToken } from "../utils/tokenCipher";

const router = Router();

const PUBLIC_ACCOUNT_COLUMNS = {
  id: socialAccounts.id,
  userId: socialAccounts.userId,
  platform: socialAccounts.platform,
  platformUserId: socialAccounts.platformUserId,
  platformUsername: socialAccounts.platformUsername,
  tokenExpiresAt: socialAccounts.tokenExpiresAt,
  profileImageUrl: socialAccounts.profileImageUrl,
  isActive: socialAccounts.isActive,
  connectedAt: socialAccounts.connectedAt,
  createdAt: socialAccounts.createdAt,
  updatedAt: socialAccounts.updatedAt,
} as const;

function platform(value: unknown): SocialPlatform {
  if (typeof value !== "string" || !(SOCIAL_PLATFORMS as readonly string[]).includes(value)) {
    throw new Error("platform is invalid");
  }
  return value as SocialPlatform;
}

function date(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    throw new Error("tokenExpiresAt must be a date");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("tokenExpiresAt must be a valid date");
  return parsed;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const accounts = await getDb()
      .select(PUBLIC_ACCOUNT_COLUMNS)
      .from(socialAccounts)
      .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.isActive, true)));
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch social accounts" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const input = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof input.platformUserId !== "string" ||
      typeof input.platformUsername !== "string" ||
      typeof input.accessToken !== "string" ||
      input.accessToken.length === 0
    ) {
      return res.status(400).json({ message: "Social account fields are invalid" });
    }
    const id = uuidv7();
    const rows = await getDb()
      .insert(socialAccounts)
      .values({
        id,
        userId,
        platform: platform(input.platform),
        platformUserId: input.platformUserId,
        platformUsername: input.platformUsername,
        accessTokenCiphertext: encryptSocialToken(input.accessToken, {
          accountId: id,
          kind: "access",
        }),
        refreshTokenCiphertext:
          typeof input.refreshToken === "string" && input.refreshToken.length > 0
            ? encryptSocialToken(input.refreshToken, { accountId: id, kind: "refresh" })
            : undefined,
        tokenExpiresAt: date(input.tokenExpiresAt),
        profileImageUrl:
          typeof input.profileImageUrl === "string" ? input.profileImageUrl : undefined,
      })
      .returning(PUBLIC_ACCOUNT_COLUMNS);
    const account = rows[0];
    if (!account) throw new Error("Social account insert returned no row");
    return res.status(201).json({ message: "Account connected", account });
  } catch (error) {
    return res.status(500).json({ message: "Failed to connect account" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const id = req.params.id;
    if (typeof id !== "string") return res.status(400).json({ message: "id is invalid" });
    const rows = await getDb()
      .update(socialAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(socialAccounts.id, id), eq(socialAccounts.userId, userId)))
      .returning(PUBLIC_ACCOUNT_COLUMNS);
    const account = rows[0];
    if (!account) return res.status(404).json({ message: "Account not found" });
    return res.json({ message: "Account disconnected" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to disconnect account" });
  }
});

export default router;
