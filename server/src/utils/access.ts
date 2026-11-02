export type Role = 'owner' | 'editor' | 'viewer';

interface AccessDoc {
  ownerId: string;
  collaborators?: { userId: string; role: 'editor' | 'viewer' }[];
}

/** Returns the user's role on the document, or null if they have no access. */
export const getRole = (doc: AccessDoc, userId: string): Role | null => {
  if (doc.ownerId === userId) return 'owner';
  const collab = doc.collaborators?.find((c) => c.userId === userId);
  return collab ? collab.role : null;
};

export const canWrite = (role: Role | null): boolean => role === 'owner' || role === 'editor';
