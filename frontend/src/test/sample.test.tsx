import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("frontend test setup", () => {
	it("renders and queries a basic UI element", () => {
		render(<button type="button">Fixture test</button>);

		expect(
			screen.getByRole("button", { name: "Fixture test" }),
		).toBeInTheDocument();
	});
});
