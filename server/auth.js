import jwt from "jsonwebtoken";

export function signAuthToken(userDoc) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Missing JWT_SECRET in environment (.env)");
  }

  return jwt.sign(
    {
      sub: String(userDoc._id),
      email: String(userDoc.email).toLowerCase(),
      role: userDoc.role
    },
    secret,
    {
      expiresIn: "7d"
    }
  );
}

export function verifyAuthToken(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return null;
  }

  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}