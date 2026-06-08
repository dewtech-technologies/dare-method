method Check(x: int) returns (ok: bool)
  ensures x >= 0 && x <= 100;
{
  ok := x >= 0 && x <= 100;
}
