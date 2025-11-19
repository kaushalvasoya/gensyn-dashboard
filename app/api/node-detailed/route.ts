// app/api/node-detailed/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const urlObj = new URL(req.url);
    const ip = urlObj.searchParams.get("ip");
    const token = urlObj.searchParams.get("token"); // optional node token

    if (!ip) {
      return NextResponse.json(
        { ok: false, error: "Missing ip parameter" },
        { status: 400 }
      );
    }

    // Build upstream URL. If token present, pass it as require_token query param.
    const upstream = token
      ? `http://${ip}:9105/detailed-metrics?require_token=${encodeURIComponent(
          token
        )}`
      : `http://${ip}:9105/detailed-metrics`;

    // Fetch from node agent
    const res = await fetch(upstream, { cache: "no-store", method: "GET" });

    if (!res.ok) {
      // upstream returned an error status
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `Upstream returned ${res.status}`,
          upstream_body: text ? text.substring(0, 2000) : undefined,
        },
        { status: 502 }
      );
    }

    // parse json. If upstream returns non-json, handle gracefully.
    let data;
    try {
      data = await res.json();
    } catch (e) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "Upstream returned non-JSON response", upstream_body: text },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error in proxy" },
      { status: 500 }
    );
  }
}
