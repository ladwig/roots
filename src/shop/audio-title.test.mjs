import { test } from "node:test"
import assert from "node:assert/strict"
import { titleFromFile } from "./convert.ts"

test("track titles from master file names", () => {
  assert.equal(titleFromFile("objects_LENGUA001 - A1 Npoint_O - Gasp Master (24, 44.1).wav"), "Gasp")
  assert.equal(titleFromFile("B2 - Stigma - Npoint_O_Arclab_MSTR_4424.wav"), "Stigma")
  assert.equal(titleFromFile("B1 - Control Rhythm - Npoint_O_Arclab_MSTR3_4424.wav"), "Control Rhythm")
  assert.equal(titleFromFile("03 Exodus.flac"), "Exodus")
  assert.equal(titleFromFile("track_final.wav"), "track_final")
})
