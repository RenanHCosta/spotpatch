import { handleApiRequest } from "@/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleApiRequest;
export const POST = handleApiRequest;
export const PATCH = handleApiRequest;
export const OPTIONS = handleApiRequest;
