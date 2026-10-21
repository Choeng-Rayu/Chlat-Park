import base from "@chlat/config/eslint";

/**
 * The API's ESLint config.
 *
 * It starts from the shared config and adds the rules that only make sense
 * for a NestJS service.
 */
export default [
  ...base,
  {
    files: ["src/**/*.ts"],
    rules: {
      // A NestJS controller method legitimately returns `Promise<void>` and
      // an empty interface is the idiomatic shape for a DTO with no fields.
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",

      // NestJS resolves a constructor dependency through the *runtime* value
      // of the imported class, not through its type. The API compiles with
      // `emitDecoratorMetadata: true`, so the constructor's parameter types
      // are emitted as `design:paramtypes` — a reference to the class value.
      //
      // A type-only import (`import { type PrismaService }`) is erased at
      // compile time, so the emitted reference becomes `undefined` and the
      // injector fails with:
      //
      //   "Nest can't resolve dependencies of the HealthService (?)"
      //
      // The rule cannot know that a class is a DI token, so it is off for
      // `src/`. The API's e2e suite boots the real application graph and is
      // the regression guard for this mistake.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
];
