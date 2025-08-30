import type { GetServerSideProps } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

type ShortLinkDoc = { token: string; createdAt: number };
type Props = { to?: string };

export default function RedirectPage({ to }: Props) {
  if (to && typeof window !== 'undefined') {
    window.location.replace(to);
  }
  return <main style={{ padding: 24 }}>{to ? 'يتم تحويلك…' : 'الرابط غير موجود'}</main>;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = typeof ctx.query.id === 'string' ? ctx.query.id : '';
  if (!id) return { props: {} };

  const db = dbAdmin();
  const snap = await db.collection('short_links').doc(id).get();
  if (!snap.exists) return { notFound: true };

  const data = snap.data() as ShortLinkDoc;
  const to = `/review/${encodeURIComponent(data.token)}`;

  return {
    redirect: { destination: to, permanent: false },
    props: {},
  };
};
