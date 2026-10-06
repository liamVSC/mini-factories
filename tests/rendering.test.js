  assert.match(source,/out\.push\(last\)/);
});

test('road junction rendering covers both T and four-way intersection cases',()=>{
  const source=readSource(new URL('../src/rendering/roads.ts',import.meta.url));
  assert.match(source,/degree=Math\.max\(3,roadsAtPoint\|\|3\)/);
  assert.match(source,/radius=degree>=4\?24:20/);
  assert.ok(source.includes('function junctionMesh(p,roadsAtPoint:number)'));
});