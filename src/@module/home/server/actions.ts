"use server";

import { createClient } from "@/integrations/supabase/server";
import { sendWelcomeEmail } from "@/lib/email";
import { COUNTRY_BY_ISO } from "@/lib/country-codes";
import { onboardingFormSchema, type OnboardingFormData } from "../schemas/onboarding.schema";
import { OnboardingConflictError } from "./onboarding-errors";

function toOnboardingConflictError(insertError: {
    code?: string;
    message?: string;
    details?: string | null;
    constraint?: string;
}): OnboardingConflictError | null {
    if (insertError.code !== "23505") return null;

    const text = `${insertError.constraint ?? ""} ${insertError.message ?? ""} ${insertError.details ?? ""}`.toLowerCase();

    if (text.includes("email")) {
        return new OnboardingConflictError("This email is already registered.", "email");
    }
    if (text.includes("contact_number") || text.includes("phone")) {
        return new OnboardingConflictError("This phone number is already registered.", "contactNumber");
    }

    return new OnboardingConflictError("This email or phone number is already registered.");
}

export async function joinCommunityAction(data: OnboardingFormData) {
    const validation = onboardingFormSchema.safeParse(data);
    if (!validation.success) {
        throw new Error("Validation failed. Please check your form inputs.");
    }

    const { name, email, contactNumber, countryCode, profession, organisation_name } =
        validation.data;

    const known = COUNTRY_BY_ISO.get(countryCode);
    if (!known) {
        throw new Error("Validation failed. Please select a valid country code.");
    }
    if (!contactNumber.startsWith(`+${known.dial}`)) {
        throw new Error("Validation failed. Please check your form inputs.");
    }
    const validCountryCode = known.iso;

    const supabase = await createClient();

    const { data: existingEmail, error: emailCheckError } = await supabase
        .from("profiles")
        .select("email")
        .eq("email", email)
        .maybeSingle();

    if (emailCheckError) {
        console.error("Supabase email query error:", emailCheckError);
        throw new Error("Database lookup failed during validation checks.");
    }

    if (existingEmail) {
        throw new OnboardingConflictError("This email is already registered.", "email");
    }

    const { data: existingPhone, error: phoneCheckError } = await supabase
        .from("profiles")
        .select("contact_number")
        .eq("contact_number", contactNumber)
        .maybeSingle();

    if (phoneCheckError) {
        console.error("Supabase contact query error:", phoneCheckError);
        throw new Error("Database lookup failed during validation checks.");
    }

    if (existingPhone) {
        throw new OnboardingConflictError("This phone number is already registered.", "contactNumber");
    }

    const insertPayload = {
        name,
        email,
        contact_number: contactNumber,
        country_code: validCountryCode,
        profession,
        organisation_name,
    };
    const { error: insertError } = await supabase.from("profiles").insert(insertPayload);

    if (insertError) {
        console.error("Supabase insert error:", insertError);

        const conflictError = toOnboardingConflictError(insertError);
        if (conflictError) {
            throw conflictError;
        }

        throw new Error("Failed to submit onboarding profile. Please try again.");
    }

    try {
        await sendWelcomeEmail({ email, name });
    } catch (emailErr) {
        console.error("Failed to send welcome email during onboarding:", emailErr);
    }

    return {
        success: true,
        message: "Successfully joined the community!",
    };
}

export async function getRegisteredUserCountAction(): Promise<number> {
    try {
        const supabase = await createClient();

        const { data: rpcCount, error: rpcError } = await supabase.rpc("get_registered_user_count");

        if (!rpcError && typeof rpcCount === "number") {
            return rpcCount;
        }

        const { count, error } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true });

        if (error) {
            console.error("Supabase count query error:", error);
            return 0;
        }

        return count ?? 0;
    } catch (error) {
        console.error("Unexpected error in getRegisteredUserCountAction:", error);
        return 0;
    }
}
