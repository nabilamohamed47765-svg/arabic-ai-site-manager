export async function onRequestPost(context) {
  return Response.json(
    {
      error: "التسجيل مغلق. الأداة دي للاستخدام الشخصي فقط."
    },
    { status: 403 }
  );
}