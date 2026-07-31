import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getEmployeeContext } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/telegramAuth";
import type { AuthenticatedEmployee } from "@/lib/types";

export type EmployeeAuthorization =
  | { employee: AuthenticatedEmployee }
  | { response: NextResponse };

export async function requireEmployee(
  request: NextRequest
): Promise<EmployeeAuthorization> {
  const tgId = getSessionUserId(request);
  if (!tgId) {
    return {
      response: NextResponse.json(
        { error: "Требуется авторизация." },
        { status: 401 }
      )
    };
  }

  const employee = await getEmployeeContext(tgId);
  if (!employee) {
    return {
      response: NextResponse.json(
        { error: "Доступ не предоставлен" },
        { status: 403 }
      )
    };
  }

  return { employee };
}

export async function requireAdmin(
  request: NextRequest
): Promise<EmployeeAuthorization> {
  const authorization = await requireEmployee(request);
  if ("response" in authorization) {
    return authorization;
  }

  if (!authorization.employee.role.is_admin) {
    return {
      response: NextResponse.json(
        { error: "Доступ разрешён только администратору." },
        { status: 403 }
      )
    };
  }

  return authorization;
}
