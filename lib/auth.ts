import bcrypt from 'bcryptjs'

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.HASHED_PASSWORD
  if (!hash) return false
  return bcrypt.compare(password, hash)
}
