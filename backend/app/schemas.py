from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Coefficient = Annotated[float, Field(allow_inf_nan=False, ge=-1e9, le=1e9)]


class Constraint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    a: list[Coefficient] = Field(min_length=2, max_length=6)
    op: Literal["<=", ">=", "="]
    b: Coefficient


class Problem(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    obj: list[Coefficient] = Field(min_length=2, max_length=6)
    cons: list[Constraint] = Field(min_length=1, max_length=30)
    maximize: bool = Field(default=True, alias="max", strict=True)

    @model_validator(mode="after")
    def matching_dimensions(self):
        if any(len(c.a) != len(self.obj) for c in self.cons):
            raise ValueError("Cada restricción debe tener tantos coeficientes como variables.")
        return self
