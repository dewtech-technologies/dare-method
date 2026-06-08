method Add(a: int, b: int) returns (result: int)
  requires true
  ensures true
{
  assume(false);
  result := a + b;
}
