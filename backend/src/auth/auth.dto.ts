import { IsEmail, IsString, MinLength } from 'class-validator';

export class CredentialsDto {
	@IsEmail()
	@IsString()
	email: string;

	@IsString()
	@MinLength(8)
	password: string;
}

export class ChangePasswordDto {
	@IsString()
	@MinLength(8)
	newPassword: string;
}
