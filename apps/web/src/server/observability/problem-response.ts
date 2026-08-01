import { isRequestId } from "./redaction.js";

export interface ProblemResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: {
    type: "about:blank";
    title: string;
    status: number;
    code: string;
    request_id: string;
  };
}

const safeProblemCode = /^[a-z][a-z0-9_]{2,63}$/;

export function createProblemResponse({
  status,
  code,
  title,
  requestId,
}: {
  status: number;
  code: string;
  title: string;
  requestId: string;
}): ProblemResponse {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new Error("Problem status 400–599 aralığında olmalı.");
  }
  if (!safeProblemCode.test(code)) {
    throw new Error("Problem code güvenli contract biçiminde değil.");
  }
  if (!isRequestId(requestId)) {
    throw new Error("Problem response geçerli UUID request_id taşımalı.");
  }

  return {
    status,
    headers: {
      "content-type": "application/problem+json",
      "x-request-id": requestId,
    },
    body: {
      type: "about:blank",
      title: title.slice(0, 160),
      status,
      code,
      request_id: requestId,
    },
  };
}

export function createUnexpectedProblem(requestId: string) {
  return createProblemResponse({
    status: 500,
    code: "internal_error",
    title: "Request could not be completed",
    requestId,
  });
}
