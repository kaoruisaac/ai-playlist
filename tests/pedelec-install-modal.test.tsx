import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectPedelec } = vi.hoisted(() => ({ connectPedelec: vi.fn(async (_settings, _update, _get, callbacks) => { callbacks.onState("not-installed"); return null; }) }));
vi.mock("../src/lib/pedelec", () => ({ connectPedelec }));

import App from "../src/App";

describe("Pedelec install prompt", () => {
  beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-TW"] }); connectPedelec.mockClear(); });

  it("opens once after the initial not-installed result and can be dismissed", async () => {
    render(<App />);
    await screen.findByRole("dialog", { name: "尚未偵測到 Pedelec" });
    expect(screen.getByRole("link", { name: "下載桌面端" }).getAttribute("href")).toBe("https://pedelec.cc/download");
    expect(screen.getByRole("link", { name: "安裝 Chrome Extension" }).getAttribute("href")).toBe("https://chromewebstore.google.com/detail/pedelec/ogccgaminlphbkeghldidiiimajfdpag");
    fireEvent.click(screen.getByRole("button", { name: "關閉安裝提示" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "尚未偵測到 Pedelec" })).toBeNull());
    expect(screen.getByText("Pedelec 讓我能真的替你研究與選曲。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新檢查" }));
    await waitFor(() => expect(connectPedelec).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog", { name: "尚未偵測到 Pedelec" })).toBeNull();
  });
});
