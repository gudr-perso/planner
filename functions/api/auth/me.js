export async function onRequestGet({ data }) {
  return Response.json({ user: data.user });
}
