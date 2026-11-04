import { test } from "node:test"
import assert from "node:assert/strict"
import { titleFromFile } from "./convert.ts"

test("track title = file name without extension", () => {
  assert.equal(titleFromFile("B2 - Stigma - Npoint_O_Arclab_MSTR_4424.wav"), "B2 - Stigma - Npoint_O_Arclab_MSTR_4424")
  assert.equal(titleFromFile("03 Exodus.flac"), "03 Exodus")
})
