import { NextResponse } from "next/server";
import { joinCommunityAction } from "@/@module/home/server/actions";
import { OnboardingConflictError } from "@/@module/home/server/onboarding-errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await joinCommunityAction(body);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const isConflict = error instanceof OnboardingConflictError;
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";

    return NextResponse.json(
      {
        error: message,
        ...(isConflict ? { field: error.field } : {}),
      },
      { status: isConflict ? 409 : 400 },
    );
  }
}
