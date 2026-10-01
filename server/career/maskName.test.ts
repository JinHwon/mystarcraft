import { describe, expect, it } from "vitest";
import { maskName } from "./maskName";

describe("maskName", () => {
  it("뒤쪽 절반을 *로 가린다", () => {
    expect(maskName("manual37905")).toBe("manual*****");
    expect(maskName("abcd")).toBe("ab**");
    expect(maskName("감독님")).toBe("감독*");
  });
  it("짧은 이름도 최소 한 글자는 가린다", () => {
    expect(maskName("a")).toBe("a*");
    expect(maskName("ab")).toBe("a*");
  });
});
