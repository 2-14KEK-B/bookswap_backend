import { CreateBook, ModifyBook } from "@interfaces/book";
import { IsBoolean, IsNumberString, IsOptional, IsString, IsUrl } from "class-validator";

class CreateBookDto implements CreateBook {
    @IsString()
    public author: string;

    @IsString()
    public title: string;

    @IsUrl()
    @IsOptional()
    public picture: string;

    @IsString({ each: true })
    public category: string[];

    @IsNumberString()
    @IsOptional()
    public price: number;

    @IsBoolean()
    public for_borrow: boolean;
}

class ModifyBookDto implements ModifyBook {
    @IsString()
    public author: string;

    @IsString()
    public title: string;

    @IsUrl()
    public picture: string;

    @IsString({ each: true })
    public category: string[];

    @IsNumberString()
    public price: number;

    @IsBoolean()
    public for_borrow: boolean;
}

export { CreateBookDto, ModifyBookDto };