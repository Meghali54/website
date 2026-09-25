export class OnboardingConflictError extends Error {
    field?: "email" | "contactNumber";

    constructor(message: string, field?: "email" | "contactNumber") {
        super(message);
        this.name = "OnboardingConflictError";
        this.field = field;
    }
}
