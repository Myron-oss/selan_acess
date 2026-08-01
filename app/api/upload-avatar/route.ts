import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireEmployee } from "@/lib/apiAuth";
import { MAX_AVATAR_BYTES } from "@/lib/attachments";
import { EMPLOYEE_AVATARS_CACHE_TAG } from "@/lib/cachedReferenceData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      return authorization.response;
    }
    const { employee } = authorization;

    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Выберите изображение." },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Можно загружать только изображения." },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: "Размер изображения не должен превышать 4 МБ." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const objectPath = `${employee.tg_id}/avatar`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(objectPath, bytes, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: true
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(objectPath);
    const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase
      .from("employees")
      .update({ avatar_url: avatarUrl })
      .eq("id", employee.id);

    if (updateError) {
      throw updateError;
    }

    revalidateTag(EMPLOYEE_AVATARS_CACHE_TAG);

    return NextResponse.json({ avatar_url: avatarUrl });
  } catch (error) {
    console.error("Failed to upload avatar", error);
    return NextResponse.json(
      { error: "Не удалось загрузить аватарку." },
      { status: 500 }
    );
  }
}
