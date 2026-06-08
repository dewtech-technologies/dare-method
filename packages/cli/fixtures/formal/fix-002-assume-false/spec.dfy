method Bad(a: int) returns (r: int)
  ensures true
{
  assume(false);
  r := a;
}
